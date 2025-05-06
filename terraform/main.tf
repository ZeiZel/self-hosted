provider "aws" {
  region = "us-east-1"
}

resource "aws_instance" "dev" {
  ami           = "ami-0c02fb55956c7d316" # Ubuntu 20.04
  instance_type = "t2.micro"

  tags = {
    Name = "TerraformDev"
  }

  provisioner "remote-exec" {
    inline = [
      "sudo apt-get update -y",
      "sudo apt-get install -y python3 python3-pip",
      "sudo apt-get install -y ansible"
    ]
  }

  provisioner "local-exec" {
    command = <<EOT
      ANSIBLE_HOST_KEY_CHECKING=False \
      ansible-playbook -i ${self.public_ip}, ansible/site.yml \
      --user ubuntu --private-key ~/.ssh/id_rsa
    EOT
  }

  connection {
    type        = "ssh"
    user        = "ubuntu"
    private_key = file("~/.ssh/id_rsa")
    host        = self.public_ip
  }
}
