Vagrant.configure("2") do |config|
	(1..2).each do |i|
		config.vm.define "server#{i}" do |web|
			web.vm.box = "net9/ubuntu-24.04-arm64" # "ubuntu/focal64" for x86 based systems
			web.vm.network "forwarded_port", id: "ssh", host: 2222 + i, guest: 22
			web.vm.network "private_network", ip: "10.11.10.#{i}", virtualbox__intnet: true
            web.vm.hostname = "server#{i}"

			web.vm.provision "shell" do |s|
				ssh_pub_key = File.readlines("#{Dir.home}/.ssh/id_rsa.pub").first.strip
				s.inline = <<-SHELL
				echo #{ssh_pub_key} >> /home/vagrant/.ssh/authorized_keys
				echo #{ssh_pub_key} >> /root/.ssh/authorized_keys
				SHELL
			end

			web.vm.provider "virtualbox" do |v|
				v.name = "server#{i}"
				v.memory = 2048
				v.cpus = 1
			end
		end
	end
end
